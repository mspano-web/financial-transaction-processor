/* 
  transaction.service.ts
*/

import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmptyError, Observable, defaultIfEmpty, lastValueFrom } from 'rxjs';
import { Producer, Consumer } from 'kafkajs';
import { TransactionDto } from '../dto/transaction.dto';
import { TransactionStatus } from '../types/results';
import { KafkaTopics } from '../types/topics';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel('Transaction') private readonly transactionModel: Model<any>,
    @Inject('PRODUCER_PROVIDER') private readonly kafkaProducer: Producer,
    @Inject('CONSUMER_PROVIDER') private readonly kafkaConsumer: Consumer,
  ) {}

  // ------------------------------------------------

  onModuleInit() {
    this.startConsumer();
  }

  // ------------------------------------------------

  onModuleDestroy() {
    this.stopConsumer();
  }

  // ------------------------------------------------

  // Processing responses to the results of transactions.
  async startConsumer() {
    // The Kafka consumer is started
    await this.kafkaConsumer.run({
      // Applies to each message received
      // In the context of KafkaJS, eachMessage is a function used to specify the behavior to be executed
      //     whenever a message is received in a Kafka consumer. The eachMessage function takes an
      //     unstructured object as an argument that contains the received message information.
      eachMessage: async ({ message }) => {
        try {
          const messageValue = message.value.toString();
          const { result, transaction, error } = JSON.parse(messageValue);

          console.log('------------------------------------------------');
          console.log('StartConsumer - Received message:', {
            result,
            transaction,
            error,
          });

          switch (result) {
            case TransactionStatus.OK:
            case TransactionStatus.FAILED:
            case TransactionStatus.FAILED_INCONSISTENCE:
              await this.updateTransactionStatus(transaction.id, result);
              break;
            default:
              const messageError = `Unexpected result type -  transaction.id=${transaction.id} - result: ${result}`;
              throw new Error(messageError);
          }
        } catch (error) {
          console.error(
            'Error processing the result of the transaction error :',
            error,
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------

  async processTransaction(transaction: TransactionDto): Promise<void> {
    let createdTransaction: any = null;

    try {
      createdTransaction = await this.transactionModel.create(transaction);

      if (!createdTransaction || !createdTransaction.id) {
        throw new Error(
          `Created transaction or its ID is undefined - transaction id: 
          ${transaction.id}`,
        );
      }

      await lastValueFrom(
        this.sendTransaction(
          KafkaTopics.START_TRANSACTIONS_CREDIT_CARD,
          transaction,
        ).pipe(defaultIfEmpty(null)),
      ).catch((error) => {
        if (error instanceof EmptyError) {
          console.error(
            'The event stream is empty - transaction id:',
            transaction.id,
          );
        } else {
          console.error(
            'Error processing transaction id:',
            transaction.id,
            ' error: ',
            error,
          );
        }
        throw error;
      });

      await this.updateTransactionStatus(
        createdTransaction.id,
        TransactionStatus.IN_PROGRESS,
      ).catch((updateError) => {
        console.error(
          'Failed to update transaction status to "in progress" - id:',
          transaction.id,
          ' error: ',
          updateError,
        );
        throw updateError;
      });
    } catch (error) {
      console.error(
        'Error processing transaction: ',
        transaction.id,
        ' error: ',
        error,
      );

      if (createdTransaction && createdTransaction.id) {
        await this.updateTransactionStatus(
          createdTransaction.id,
          TransactionStatus.PENDING_RETRY,
        ).catch((updateError) => {
          console.error(
            'Failed to update transaction status - id:',
            transaction.id,
            ' error: ',
            updateError,
          );
        });
      } else {
        console.error('Failed to create  transaction- id:', transaction.id);
      }

      throw new Error(error);
    }
  }

  // -----------------------------------------

  private sendTransaction(
    topic: string,
    message: TransactionDto,
  ): Observable<any> {
    return new Observable((observer) => {
      this.kafkaProducer
        .send({
          topic,
          messages: [{ value: JSON.stringify(message) }],
        })
        .then(() => {
          observer.complete();
        })
        .catch((error) => {
          console.error('Failed to post message id, error:', error);
          observer.error();
        });
    });
  }

  // ------------------------------------------------------

  async updateTransactionStatus(transactionId: string, status: string) {
    const currentStatus = await this.getTransactionStatus(transactionId);
    const allowedStatusUpdates = {
      [TransactionStatus.IN_PROGRESS]: [
        TransactionStatus.NEW,
        TransactionStatus.PENDING_RETRY,
      ],
      [TransactionStatus.PENDING_RETRY]: [TransactionStatus.NEW],
      [TransactionStatus.OK]: [TransactionStatus.IN_PROGRESS],
      [TransactionStatus.FAILED]: [
        TransactionStatus.IN_PROGRESS,
        TransactionStatus.OK,
      ],
      [TransactionStatus.FAILED_INCONSISTENCE]: [
        TransactionStatus.IN_PROGRESS,
        TransactionStatus.FAILED,
        TransactionStatus.OK,
      ],
    };

    const canUpdate = allowedStatusUpdates[status]?.includes(currentStatus);

    if (!canUpdate) {
      throw new Error(
        `Workflow failure: Cannot update status from ${currentStatus} to ${status} in transaction id ${transactionId}`,
      );
    }

    try {
      const updatedTransaction = await this.transactionModel.updateOne(
        { id: transactionId },
        { $set: { status: status } },
      );
      console.log(
        'updateTransactionStatus OK - id: ',
        transactionId,
        ' Status: ',
        status,
      );
      return updatedTransaction;
    } catch (error) {
      console.error(
        'Error updating document status - transaction id:',
        transactionId,
        ' error :',
        error,
      );
      throw error;
    }
  }

  // ------------------------------------------------------

  async getTransactionStatus(transactionId: string): Promise<string> {
    const transaction = await this.transactionModel.findOne(
      { id: transactionId },
      'status',
    );
    if (!transaction) {
      throw new Error(`Transaction with id ${transactionId} not found`);
    }
    return transaction.status;
  }

  // ------------------------------------------------------

  private async stopConsumer() {
    await this.kafkaConsumer.disconnect();
  }
}

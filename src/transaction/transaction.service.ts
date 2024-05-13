/* 
  transaction.service.ts
*/

import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, firstValueFrom } from 'rxjs';
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
      //Failure testing with database service down.
      createdTransaction = await this.transactionModel.create(transaction);

      if (!createdTransaction || !createdTransaction.id) {
        throw new Error(
          `Created transaction or its ID is undefined - id: 
          ${transaction.id}`,
        );
      }

      // Failure testing with kafka service down.
      await firstValueFrom(
        this.sendTransaction(
          KafkaTopics.START_TRANSACTIONS_CREDIT_CARD,
          transaction,
        ),
      );
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
            'Failed to update transaction status - id::',
            transaction.id,
            ' error: ',
            updateError,
          );
        });
      } else {
        console.error('Failed to create  transaction- id::', transaction.id);
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
    try {
      // A control of status changes is missing in the workflow
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
      console.error('Error updating document status:', error);
      throw error;
    }
  }

  // ------------------------------------------------------

  private async stopConsumer() {
    await this.kafkaConsumer.disconnect();
  }
}

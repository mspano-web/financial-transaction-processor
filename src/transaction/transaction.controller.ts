/* 
  transaction.controller.ts
*/

import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionDto } from 'src/dto/transaction.dto';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  async createTransaction(
    @Body() transaction: TransactionDto,
  ): Promise<string> {
    try {
      console.log('---------------------------------------------------');
      console.log('Controller receive: transaction: ', transaction);

      await this.transactionService.processTransaction(transaction);
      console.log(`Transaction processed successfully - id: ${transaction.id}`);

      return `Transaction processed successfully - id: ${transaction.id}`;
    } catch (error) {
      const messageError = `Error processing the transaction id: ${transaction.id}  error:  ${error}`;
      console.error(messageError);
      throw new HttpException(messageError, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

/* 
  transaction.module.ts
*/

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { MongoModule } from '../mongo/mongo.module';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { Transaction, TransactionSchema } from './transaction.schema';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    KafkaModule,
    MongoModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [MongooseModule],
})
export class TransactionModule {}

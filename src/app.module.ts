/* 
  app.module.ts
*/

import { Module } from '@nestjs/common';
import { TransactionController } from './transaction/transaction.controller';
import { MongoModule } from './mongo/mongo.module';
import { KafkaModule } from './kafka/kafka.module';
import { TransactionService } from './transaction/transaction.service';
import { ConfigModule } from '@nestjs/config';
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongoModule,
    KafkaModule,
    TransactionModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
})
export class AppModule {}

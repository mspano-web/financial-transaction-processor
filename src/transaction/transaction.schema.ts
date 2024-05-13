/* 
  transaction.schema.ts
*/

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Defines a TransactionDocument document type that combines the Transaction type (defined later)
//   with Mongoose's Document interface.
//  This allows transaction documents to be treated as Mongoose documents with all their functionality.
export type TransactionDocument = Transaction & Document;

// Mark the Transaction class as a Mongoose schema.
@Schema()
export class Transaction {
  // @Prop, it is a decorator that indicates how these properties should be treated
  //    when interacting with the MongoDB database.
  @Prop({ required: true })
  credit_card_number: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  destination: string;

  @Prop({ required: true })
  transaction_datetime: string;

  @Prop({ required: true })
  location: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  status: string;

  @Prop({ required: true })
  id: string;
}

// Create the Mongoose schema based on the Transaction class.
// This generates a Mongoose schema object that will be used to interact with the MongoDB database.
export const TransactionSchema = SchemaFactory.createForClass(Transaction);

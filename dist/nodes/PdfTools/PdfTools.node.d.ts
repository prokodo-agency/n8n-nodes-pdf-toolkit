import { type INodeType, type INodeTypeDescription, type INodeExecutionData, type IExecuteFunctions } from 'n8n-workflow';
import 'pdfjs-dist/legacy/build/pdf.worker.js';
export declare class PdfTools implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}

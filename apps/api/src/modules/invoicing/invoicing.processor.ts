import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { InvoicingService } from './invoicing.service.js';
import { EINVOICE_QUEUE, type IssueJobData } from './queue.js';

/** Worker phát hành hóa đơn điện tử: thử lại lũy tiến tối đa 5 lần; lỗi không thể thử lại dừng ngay. */
@Processor(EINVOICE_QUEUE, { concurrency: 2 })
export class InvoicingProcessor extends WorkerHost {
  private readonly logger = new Logger('InvoicingWorker');

  constructor(private readonly invoicing: InvoicingService) {
    super();
  }

  async process(job: Job<IssueJobData>): Promise<{ id: string; status: string }> {
    const result = await this.invoicing.issueNow(job.data.eInvoiceId, job.attemptsMade + 1);
    this.logger.log(`HĐĐT ${job.data.eInvoiceId}: ${result.status}${result.invoiceNo ? ` số ${result.invoiceNo}` : ''}`);
    return { id: result.id, status: result.status };
  }
}

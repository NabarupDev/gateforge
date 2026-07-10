import { Service, ServiceInstance } from '@gateforge/shared';

export interface RequestContext {
  req: any;
  res?: any;
  
  // Populated during execution
  service?: Service;
  instance?: ServiceInstance;
  targetUrl?: string;
  
  // Pipeline state
  attempt: number;
  abortSignal?: AbortSignal;
}

export interface ProxyResponse {
  status: number;
  data: any;
  headers: Record<string, any>;
  targetUrl: string;
}

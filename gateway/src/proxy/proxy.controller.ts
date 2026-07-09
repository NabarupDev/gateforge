import { Controller, All, Req, Res } from '@nestjs/common';
import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*')
  async handleProxy(@Req() req: any, @Res() res: any) {
    // If request hits proxy for health or root, and we don't want proxy to capture them if they somehow bypassed other controllers
    if (req.url === '/health' || req.url === '/health/') {
      return;
    }

    const proxyRes = await this.proxyService.forwardRequest(req);

    // Attach target URL to req so interceptor can log it accurately
    req.targetUrl = proxyRes.targetUrl;

    // Set response headers
    if (proxyRes.headers) {
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value !== undefined && value !== null) {
          if (typeof res.header === 'function') {
            res.header(key, value); // Fastify & Express compatible
          } else if (typeof res.setHeader === 'function') {
            res.setHeader(key, value);
          }
        }
      }
    }

    // Send status and data
    return res.status(proxyRes.status).send(proxyRes.data);
  }
}

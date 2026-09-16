import 'reflect-metadata';
import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppModule } from './app.module';

// 依次尝试根目录与包内 .env（dotenv 默认不覆盖已存在变量；生产由容器注入 env）
dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

/**
 * 全局异常过滤器（J01 任务1）：错误响应形状统一为 {"error": <message>}。
 * - HttpException 字符串 body → {"error": msg}；对象 body（{ok:false,reason}）原样透传（前端已特判）
 * - Nest 默认 {statusCode,message} → 归一为 {"error": message}
 * - PG 参数类错误（invalid input syntax / 数值越界，code 22xxx）→ 400（兜底 NaN 防护）
 * - 其余未捕获异常 → 500 {"error": message}，不再裸 {"statusCode":500}
 */
@Catch()
class UnifiedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown>;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        body = { error: r };
      } else {
        const obj = r as Record<string, unknown>;
        // 业务语义 body（{ok:false,reason} / {found:false}）原样透传（前端已特判）
        if (typeof obj.ok === 'boolean' || typeof obj.found === 'boolean') {
          body = obj;
        } else if (typeof obj.message === 'string') {
          // Nest 内建异常响应 {message, error, statusCode} → 归一为 {"error": message}
          body = { error: obj.message };
        } else {
          body = { error: JSON.stringify(obj) };
        }
      }
    } else {
      const pgCode = (exception as { code?: string } | null)?.code ?? '';
      const msg = exception instanceof Error ? exception.message : String(exception);
      if (pgCode.startsWith('22')) {
        // PG 数据类错误：invalid input syntax for type ... / 数值越界 → 参数问题，400
        status = HttpStatus.BAD_REQUEST;
        body = { error: /invalid input syntax/i.test(msg) ? 'invalid id' : msg };
      } else {
        body = { error: msg };
      }
    }
    res.status(status).json(body);
  }
}

async function bootstrap() {
  // rawBody: true 让 express 在解析 JSON 前保留原始 body（T5：GitHub webhook HMAC 校验需要原始字节）
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.useGlobalFilters(new UnifiedExceptionFilter());
  const port = Number(process.env.API_PORT || 8080);
  await app.listen(port);
  console.log(`[verifyos-server] listening on http://localhost:${port}`);
}
bootstrap();

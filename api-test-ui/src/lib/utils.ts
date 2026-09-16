import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 className：clsx 处理条件拼接，tailwind-merge 去重冲突类 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

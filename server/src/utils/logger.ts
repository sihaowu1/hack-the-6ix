function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function log(tag: string, message: string): void {
  console.log(`[${stamp()}] [${tag}] ${message}`);
}

export function warn(tag: string, message: string): void {
  console.warn(`[${stamp()}] [${tag}] ${message}`);
}

export function logError(tag: string, message: string): void {
  console.error(`[${stamp()}] [${tag}] ${message}`);
}

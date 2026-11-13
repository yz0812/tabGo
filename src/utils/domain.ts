import tldText from '@/assets/data/domain.txt?raw';

const COMMON_TLDS = new Set(
  tldText
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('//')),
);

/** 常见的二级公共后缀标签，如 com.cn / co.uk / ac.jp 中的 com、co、ac */
const SECOND_LEVEL_LABELS = new Set(['com', 'net', 'org', 'gov', 'edu', 'ac', 'co', 'or', 'ne', 'go', 'mil', 'gob', 'nic', 'ltd', 'plc']);

export function isIP(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[');
}

/** 取可注册域名：mail.google.com -> google.com，www.baidu.com.cn -> baidu.com.cn */
export function getRootDomain(hostname: string): string {
  if (isIP(hostname)) return hostname;
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const tld = parts[parts.length - 1]!;
  const sld = parts[parts.length - 2]!;
  const size = tld.length === 2 && SECOND_LEVEL_LABELS.has(sld) ? 3 : 2;
  return parts.slice(-size).join('.');
}

/** 计算分组键：子域名模式下取完整主机名（去掉 www.），否则取根域名 */
export function getGroupKey(hostname: string, useSubdomain: boolean): string {
  if (isIP(hostname)) return hostname;
  return useSubdomain ? hostname.replace(/^www\./, '') : getRootDomain(hostname);
}

/** 在规则集合中按"最具体优先"查找 hostname 命中的规则：a.b.com 依次匹配 a.b.com、b.com、com */
export function findDomainRule(hostname: string, rules: { has(key: string): boolean }): string | null {
  if (isIP(hostname)) return rules.has(hostname) ? hostname : null;
  let current = hostname;
  while (current) {
    if (rules.has(current)) return current;
    const dot = current.indexOf('.');
    if (dot < 0) break;
    current = current.slice(dot + 1);
  }
  return null;
}

/** 把域名分组键简化为可读名称：google.com -> google，baidu.com.cn -> baidu */
export function simplifyDomainName(name: string): string {
  if (isIP(name)) return name;
  let parts = name.replace(/^www\./, '').split('.');
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1]!.toLowerCase();
  if (!COMMON_TLDS.has(last)) return name;
  parts = parts.slice(0, -1);
  if (parts.length >= 2 && last.length === 2 && SECOND_LEVEL_LABELS.has(parts[parts.length - 1]!)) {
    parts = parts.slice(0, -1);
  }
  return parts.join('.');
}

/** 从用户输入（URL 或域名）中提取 hostname，非法时返回空串 */
export function extractHostname(input: string): string {
  const value = input.trim().toLowerCase();
  if (!value) return '';
  try {
    const hostname = new URL(value.includes('://') ? value : `http://${value}`).hostname;
    return /^[a-z0-9.\-[\]:]+$/.test(hostname) && !hostname.startsWith('.') ? hostname : '';
  } catch {
    return '';
  }
}

function charPriority(char: string): number {
  if (!char) return 3;
  const code = char.charCodeAt(0);
  if (code >= 0x4e00 && code <= 0x9fff) return 0;
  if (/[a-z]/i.test(char)) return 1;
  if (/\d/.test(char)) return 2;
  return 3;
}

/** 分组名称排序：中文 > 英文 > 数字 > 其他，同类按拼音/字母序 */
export function compareGroupNames(a: string, b: string): number {
  return charPriority(a.charAt(0)) - charPriority(b.charAt(0)) || a.localeCompare(b, 'zh-CN');
}

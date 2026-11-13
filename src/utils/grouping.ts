import { browser } from 'wxt/browser';
import aliases from '@/assets/data/aliases.json';
import { findDomainRule, getGroupKey, simplifyDomainName } from './domain';
import type { Settings } from './settings';

/** 浏览器内置页面别名：chrome://settings -> 浏览器设置 */
const SPECIAL_PAGE_NAMES = new Map<string, string>(
  (aliases as { domain: string; name: string }[]).map((item) => [item.domain, item.name]),
);

export interface GroupContext {
  settings: Settings;
  whitelist: Set<string>;
  extensionWhitelist: Set<string>;
  /** 域名 -> 自定义分组名 */
  domainToGroup: Map<string, string>;
  /** 扩展 ID -> 扩展名称 */
  extensionNames: Map<string, string>;
}

export function createGroupContext(settings: Settings, extensionNames = new Map<string, string>()): GroupContext {
  const domainToGroup = new Map<string, string>();
  for (const [groupName, domains] of Object.entries(settings.groupNames)) {
    for (const domain of domains) domainToGroup.set(domain, groupName);
  }
  return {
    settings,
    whitelist: new Set(settings.whitelist),
    extensionWhitelist: new Set(settings.extensionWhitelist),
    domainToGroup,
    extensionNames,
  };
}

export interface GroupResolution {
  /** 最终分组名，null 表示不参与分组 */
  name: string | null;
  /** 不考虑白名单时应得的分组名，用于把加入白名单的标签移出 TabGo 建的组 */
  managedName: string | null;
  /** 分组键（域名 / 扩展 ID / 内置页面），用于界面展示和设置规则 */
  key: string | null;
  /** 命中的白名单规则 */
  whitelistRule?: string;
  /** 命中的自定义分组规则（域名） */
  aliasRule?: string;
}

const NONE: GroupResolution = { name: null, managedName: null, key: null };

export function resolveGroup(rawUrl: string | undefined, ctx: GroupContext): GroupResolution {
  if (!rawUrl) return NONE;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NONE;
  }
  const { settings } = ctx;
  const protocol = url.protocol;

  if (protocol === 'http:' || protocol === 'https:') {
    const hostname = url.hostname;
    if (!hostname) return NONE;
    const key = getGroupKey(hostname, settings.subdomainEnabled);
    const aliasRule = findDomainRule(hostname, ctx.domainToGroup);
    const managedName = aliasRule ? ctx.domainToGroup.get(aliasRule)! : simplifyDomainName(key);
    const whitelistRule = findDomainRule(hostname, ctx.whitelist) ?? undefined;
    return { name: whitelistRule ? null : managedName, managedName, key, whitelistRule, aliasRule: aliasRule ?? undefined };
  }

  if (protocol === 'chrome:' || protocol === 'edge:') {
    const key = `${protocol}//${url.hostname}`;
    const managedName = SPECIAL_PAGE_NAMES.get(key) ?? url.hostname;
    if (url.hostname === 'newtab' && (!settings.enableNewtabGrouping || ctx.extensionWhitelist.has('newtab'))) {
      return { name: null, managedName, key };
    }
    return { name: managedName, managedName, key };
  }

  if (protocol === 'chrome-extension:' || protocol === 'extension:') {
    const id = url.hostname;
    // TabGo 自己的控制台页面不参与分组
    if (id === browser.runtime.id) return NONE;
    const managedName = (settings.extensionReplace && ctx.extensionNames.get(id)) || id;
    return { name: ctx.extensionWhitelist.has(id) ? null : managedName, managedName, key: id };
  }

  return NONE;
}

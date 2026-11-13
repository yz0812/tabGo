export const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

/** 同名分组始终分配同一种颜色，便于跨窗口识别 */
export function colorForName(name: string): GroupColor {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length]!;
}

export const GROUP_COLOR_HEX: Record<string, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#e8a200',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

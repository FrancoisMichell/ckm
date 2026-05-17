export enum Belt {
  WHITE = 'white',
  YELLOW = 'yellow',
  ORANGE = 'orange',
  GREEN = 'green',
  BLUE = 'blue',
  BROWN = 'brown',
  BLACK = 'black',
}

export interface BeltConfig {
  label: string;
  color: string;
}

export const BELT_CONFIGS: Record<Belt, BeltConfig> = {
  [Belt.WHITE]: { label: 'Branca', color: '#FFFFFF' },
  [Belt.YELLOW]: { label: 'Amarela', color: '#FFD700' },
  [Belt.ORANGE]: { label: 'Laranja', color: '#F97316' },
  [Belt.GREEN]: { label: 'Verde', color: '#16A34A' },
  [Belt.BLUE]: { label: 'Azul', color: '#1D4ED8' },
  [Belt.BROWN]: { label: 'Marrom', color: '#92400E' },
  [Belt.BLACK]: { label: 'Preta', color: '#171717' },
};

export const BELT_ORDER = [
  Belt.WHITE,
  Belt.YELLOW,
  Belt.ORANGE,
  Belt.GREEN,
  Belt.BLUE,
  Belt.BROWN,
  Belt.BLACK,
] as const;

const BELT_RANK_MAP = new Map<Belt, number>(
  BELT_ORDER.map((belt, i) => [belt, i + 1]),
);

export function beltRank(belt: Belt): number {
  return BELT_RANK_MAP.get(belt) ?? 0;
}

export function compareBelts(a: Belt, b: Belt): number {
  return beltRank(a) - beltRank(b);
}

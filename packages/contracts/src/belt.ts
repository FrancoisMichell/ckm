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

const BELT_RANK: Record<Belt, number> = {
  [Belt.WHITE]: 1,
  [Belt.YELLOW]: 2,
  [Belt.ORANGE]: 3,
  [Belt.GREEN]: 4,
  [Belt.BLUE]: 5,
  [Belt.BROWN]: 6,
  [Belt.BLACK]: 7,
};

export function beltRank(belt: Belt): number {
  return BELT_RANK[belt];
}

export function compareBelts(a: Belt, b: Belt): number {
  return beltRank(a) - beltRank(b);
}

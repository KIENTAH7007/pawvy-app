// What people SEE for a currency code. The code itself ('MYR') stays in the data and logic;
// only the wording on screen / documents says "RM".
export const curLabel = (c) => (c === 'MYR' ? 'RM' : c);

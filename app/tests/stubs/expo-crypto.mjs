// Stand-in for expo-crypto in the unit tests: Node's own random UUID.

import { randomUUID as nodeRandomUUID } from 'node:crypto';

export const randomUUID = () => nodeRandomUUID();

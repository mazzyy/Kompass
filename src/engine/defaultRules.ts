import text from '../config/rules.default.yaml?raw';
import { parseRules } from './rules';

export const defaultRulesText: string = text;
export const defaultRules = () => parseRules(text);

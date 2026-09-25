export const APP_LINK_BASE = 'apps.apple.com/app/id6768359920?pt=128883254&ct=';
const ACCOUNT_CODE = /^[a-z0-9]{1,20}$/;
const CARD_CODE = /^[a-z0-9]{1,18}$/;

export function cleanAccountCode(handle) {
  const code = String(handle ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  return code || 'acc';
}

export const isValidAccountCode = (code) => ACCOUNT_CODE.test(String(code));
export const isValidCardCode = (code) => CARD_CODE.test(String(code));

export function buildCt(accountCode, cardCode) {
  if (!isValidAccountCode(accountCode)) throw new Error(`bad account code: ${accountCode}`);
  if (!isValidCardCode(cardCode)) throw new Error(`bad card code: ${cardCode}`);
  return `${accountCode}_${cardCode}`;
}

export const appLink = (ct) => APP_LINK_BASE + ct;
export const hasLinkSlot = (template) => String(template ?? '').includes('{link}');
export const fillTemplate = (template, link) => String(template ?? '').split('{link}').join(link);

export function mintCreativeCode(random = Math.random) {
  let code = 's';
  for (let i = 0; i < 6; i += 1) code += Math.floor(random() * 36).toString(36);
  return code;
}

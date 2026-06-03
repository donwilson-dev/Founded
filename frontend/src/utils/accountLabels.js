export function accountDisplayName(account) {
  if (!account) return '-';
  const bank = account.name || 'Account';
  const accountType = String(account.account_type || account.accountType || '').trim();
  const owner = String(account.owner || '').trim();
  if (accountType && owner) return `${bank} - ${accountType} (${owner})`;
  if (accountType) return `${bank} - ${accountType}`;
  if (owner) return `${bank} (${owner})`;
  return bank;
}

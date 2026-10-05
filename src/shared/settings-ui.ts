export function lines(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
}
export function siteNames(value: string) {
  return lines(value).map((site) => {
    const url = new URL(site.includes('://') ? site : 'https://' + site);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.hostname.includes('*') ||
      (url.pathname !== '/' && !site.includes('://')) ||
      url.search ||
      url.hash
    )
      throw new Error(
        'Utilisez un nom de domaine ou une URL HTTP(S) par ligne.',
      );
    return url.hostname;
  });
}

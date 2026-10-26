const axios = require('axios');

function parseRobots(text, userAgent) {
  const groups = [];
  let group = null;

  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.split('#', 1)[0].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const directive = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (directive === 'user-agent') {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], hasRules: false };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
      continue;
    }

    if (!group || !['allow', 'disallow'].includes(directive)) continue;
    group.hasRules = true;
    if (value) group.rules.push({ allow: directive === 'allow', path: value });
  }

  const normalizedAgent = userAgent.toLowerCase();
  const matched = groups.filter(item => item.agents.some(agent => agent === '*' || normalizedAgent.includes(agent)));
  const exact = matched.filter(item => item.agents.some(agent => agent !== '*'));
  const selected = exact.length ? exact : matched;
  return selected.flatMap(item => item.rules);
}

function patternToRegExp(pattern) {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '$') source += '$';
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`^${source}`);
}

function isAllowedByRobots(urlValue, rules) {
  const url = new URL(urlValue);
  const pathAndQuery = `${url.pathname}${url.search}`;
  const matches = rules
    .filter(rule => patternToRegExp(rule.path).test(pathAndQuery))
    .sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length);

  if (!matches.length) return true;
  const longest = matches[0].path.replace(/[*$]/g, '').length;
  const strongest = matches.filter(rule => rule.path.replace(/[*$]/g, '').length === longest);
  return strongest.some(rule => rule.allow);
}

async function getRobotsRules(baseUrl, userAgent) {
  const url = new URL('/robots.txt', baseUrl);
  let response;
  try {
    response = await axios.get(url.href, {
      timeout: 15000,
      maxRedirects: 3,
      headers: { 'User-Agent': userAgent, Accept: 'text/plain,*/*;q=0.8' },
      validateStatus: status => status >= 200 && status < 500,
    });
  } catch (error) {
    throw new Error(`Could not read robots.txt; refusing to crawl: ${error.message}`);
  }

  if (response.status === 404) return [];
  if (response.status !== 200 || typeof response.data !== 'string') {
    throw new Error(`robots.txt returned HTTP ${response.status}; refusing to crawl.`);
  }
  return parseRobots(response.data, userAgent);
}

module.exports = { parseRobots, isAllowedByRobots, getRobotsRules };

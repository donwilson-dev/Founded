const DEFAULT_FASTAPI_BASE_URL = 'http://127.0.0.1:8000';

function fastApiBaseUrl() {
  return (process.env.FASTAPI_BASE_URL || process.env.FASTAPI_URL || DEFAULT_FASTAPI_BASE_URL).replace(/\/$/, '');
}

function queryString(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) params.append(key, String(item));
      });
      continue;
    }
    params.append(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function parseResponseBody(text, contentType) {
  if (!text) return null;
  if (contentType.includes('application/json')) return JSON.parse(text);

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function bridgeRequest({ method = 'GET', path, query, body }) {
  // Temporary bridge boundary: replace this function when native Node
  // calculation services are migrated, without changing controller contracts.
  const url = `${fastApiBaseUrl()}${path}${queryString(query)}`;
  const options = {
    method,
    headers: {
      Accept: 'application/json',
    },
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const bridgeError = new Error('FastAPI calculation bridge unavailable');
    bridgeError.statusCode = 503;
    bridgeError.detail = error.message;
    throw bridgeError;
  }

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const responseBody = parseResponseBody(text, contentType);

  return {
    body: responseBody,
    contentType,
    status: response.status,
  };
}

async function forwardFastApiResponse(res, request) {
  const response = await bridgeRequest(request);

  if (response.contentType) {
    res.type(response.contentType);
  }

  if (response.body === null) {
    res.status(response.status).send();
    return;
  }

  res.status(response.status).send(response.body);
}

module.exports = {
  fastApiBaseUrl,
  forwardFastApiResponse,
};

const https = require('https');

const NOAA_STATION = '1615680';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*'
};

function isValidDate(value) {
  if (!DATE_PATTERN.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WaileaPhoto/1.0 (photo@waileaphoto.com)'
      }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch (error) { /* handled below */ }
        resolve({ status: response.statusCode || 500, data });
      });
    });

    request.setTimeout(8000, () => request.destroy(new Error('NOAA request timed out')));
    request.on('error', reject);
  });
}

async function getPredictions(compactDate, timeZone) {
  const params = new URLSearchParams({
    product: 'predictions',
    datum: 'MLLW',
    station: NOAA_STATION,
    time_zone: timeZone,
    units: 'english',
    interval: 'hilo',
    format: 'json',
    application: 'WaileaPhoto',
    begin_date: compactDate,
    // NOAA requires the end of a date range to be later than its beginning.
    // A 24-hour range returns exactly the selected local calendar day.
    range: '24'
  });
  return requestJson(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: 'GET' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const date = event.queryStringParameters && event.queryStringParameters.date;
  if (!isValidDate(date)) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Use a valid date in YYYY-MM-DD format.' })
    };
  }

  const compactDate = date.replace(/-/g, '');
  try {
    let response = await getPredictions(compactDate, 'lst_ldt');
    if (!response.data || !Array.isArray(response.data.predictions)) {
      response = await getPredictions(compactDate, 'lst');
    }

    if (response.status < 200 || response.status >= 300 || !response.data || !Array.isArray(response.data.predictions)) {
      console.error('NOAA tide request failed', {
        status: response.status,
        message: response.data && response.data.error && response.data.error.message
      });
      return {
        statusCode: 502,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'NOAA tide data is temporarily unavailable.' })
      };
    }

    const predictions = response.data.predictions.filter(prediction =>
      typeof prediction.t === 'string' && prediction.t.slice(0, 10) === date
    );

    return {
      statusCode: 200,
      headers: {
        ...jsonHeaders,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
      },
      body: JSON.stringify({ predictions })
    };
  } catch (error) {
    return {
      statusCode: 504,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'NOAA tide data did not respond in time.' })
    };
  }
};

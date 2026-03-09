export class Api {
  async getCurrentPageRatings(url) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ Ids: [9499, 563036, 123] })
    });
    const data = await response.json();
    return data;
  }
}

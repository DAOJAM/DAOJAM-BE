'use strict';

const { app, assert } = require('egg-mock/bootstrap');

describe('test/app/controller/account/binding.test.js', () => {
  it('should POST /account/binding', () => {
    const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzaGVsbHRlb0AxNjMuY29tIiwiZXhwIjoxNTc2NTc2MjY0NTEzLCJwbGF0Zm9ybSI6ImVtYWlsIiwiaWQiOjEwNDJ9.FSSoOx1XzzTfQMJe-uyxqUZi4RXHvq2HjzUZdzr3qz4';
    const result = app.httpRequest()
      .post('/account/binding')
      .set('x-access-token', token)
      .set('Accept', 'application/json')
      .send({
        account: 'test',
        platform: 'test',
      })
      .set('Accept', 'application/json')
      .expect(200);
    console.log(result);
    assert(result.code === 0);
  });
});

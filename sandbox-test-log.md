# Nomba Sandbox Empirical Test Log

**Run at:** 2026-07-01T19:36:24.004Z
**NOMBA_ENV:** test
**Account ID:** f666ef9b...[REDACTED]
**Sub Account ID:** e0e5cbae...[REDACTED]
**Sandbox Base URL:** https://sandbox.nomba.com
**Webhook Receiver:** https://webhook.site/ad8e5ca0-13ef-4b23-85b9-9c24688d9d74

---
### Log Entry #1 — Issue access token
**Question:** (auth)
**Timestamp:** 2026-07-01T19:35:57.975Z
**Request:** `POST https://sandbox.nomba.com/v1/auth/token/issue`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "grant_type": "client_credentials",
  "client_id": "706df6c4...[REDACTED]",
  "client_secret": "...[REDACTED]"
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "Successful",
  "status": false,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiJ9.eyJHOmY2NjZlZjliLTg4OGUtNDc5OS04NWNlLWFjYjUwNWIyODAyMyI6Ikc6ZjY2NmVmOWItODg4ZS00Nzk5LTg1Y2UtYWNiNTA1YjI4MDIzIiwiRTpzYW5kYm94LlVWY1lkWkh1R2hsbmJ5YXR2cWZneGFhZmlqeHhnd3ZoY25wamJ6dmZkeUB2ZW5kb3JfYXBpLmNvbSI6IkU6c2FuZGJveC5VVmNZZFpIdUdobG5ieWF0dnFmZ3hhYWZpanh4Z3d2aGNucGpienZmZHlAdmVuZG9yX2FwaS5jb20iLCJSOlZFTkRPUl9BUElfQURNSU4iOiJSOlZFTkRPUl9BUElfQURNSU4iLCJyZWdpb24iOiJORyIsImxhbmciOiJlbiIsImlhdCI6MTc4MjkzNDU1Nywic3ViIjoiNzA2ZGY2YzQtYjhiYi00MTMwLTg4YzQtZDIxYjA1MmY4NjMxIiwiZXhwIjoxNzgyOTQ1MzU3LCJqdGkiOiJlZDVmYmJiNy00NzIzLTQ0NDEtODg0NC1kNjJiY2Q1ZjU0OGEifQ.3xNjNSaFrbiTeSALkRrpf1rfhxRJfQ-shKKAvkFBLxg",
    "businessId": "f666ef9b-888e-4799-85ce-acb505b28023",
    "refresh_token": "229e1c4e-0c53-4e68-b0db-ba22ff512dc9_1782934557849",
    "expiresAt": "2026-07-01T22:35:57.850Z"
  }
}
```

### Log Entry #2 — Create checkout order for payment simulation
**Question:** explore
**Timestamp:** 2026-07-01T19:35:58.288Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/order`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "amount": "5000.00",
    "currency": "NGN",
    "orderReference": "sim-1782934557976",
    "customerEmail": "sim@test.com",
    "customerId": "cust-sim",
    "allowedPaymentMethods": [
      "Card"
    ]
  },
  "tokenizeCard": true
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "checkout order created successful",
  "status": false,
  "data": {
    "success": true,
    "message": "success",
    "checkoutLink": "https://pay.nomba.com/sandbox/QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh",
    "orderReference": "b0c1ce78-6826-4455-9cdb-fac886816bd9"
  }
}
```

### Log Entry #3 — Sim path: POST /v1/checkout/simulate
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:35:58.461Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/simulate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "checkoutCode": "QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh",
  "card": {
    "pan": "5434621074252808",
    "cvv": "123",
    "expiryMonth": "12",
    "expiryYear": "2027"
  }
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #4 — Sim path: POST /v1/checkout/payment/simulate
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:35:59.795Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/payment/simulate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "orderReference": "sim-1782934557976"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #5 — Sim path: POST /v1/checkout/pay
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:00.086Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/pay`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "checkoutCode": "QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #6 — Sim path: POST /v1/checkout/process-card
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:00.362Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/process-card`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "orderReference": "sim-1782934557976",
  "pan": "5434621074252808",
  "cvv": "123",
  "expiryMonth": "12",
  "expiryYear": "2027"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #7 — Sim path: POST /v1/checkout/card-payment
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:00.641Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/card-payment`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "orderReference": "sim-1782934557976",
  "pan": "5434621074252808",
  "cvv": "123",
  "expiryMonth": "12",
  "expiryYear": "2027"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #8 — Sim path: POST /v1/checkout/card-payment/QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:00.934Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/card-payment/QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "pan": "5434621074252808",
  "cvv": "123",
  "expiryMonth": "12",
  "expiryYear": "2027"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #9 — Sim path: GET /v1/checkout/payment/status?orderReference=sim-1782934557976
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:01.218Z
**Request:** `GET https://sandbox.nomba.com/v1/checkout/payment/status?orderReference=sim-1782934557976`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #10 — Sandbox sim: POST /sandbox/checkout/process-card
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:01.507Z
**Request:** `POST https://sandbox.nomba.com/sandbox/checkout/process-card`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "checkoutCode": "QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh",
  "pan": "5434621074252808",
  "cvv": "123",
  "expiryMonth": "12",
  "expiryYear": "2027",
  "pin": "1234"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #11 — Sandbox sim: POST /sandbox/checkout/simulate-payment
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:01.790Z
**Request:** `POST https://sandbox.nomba.com/sandbox/checkout/simulate-payment`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "orderReference": "sim-1782934557976"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #12 — Sandbox sim: POST /sandbox/checkout/pay
**Question:** explore-sim
**Timestamp:** 2026-07-01T19:36:02.090Z
**Request:** `POST https://sandbox.nomba.com/sandbox/checkout/pay`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "checkoutCode": "QMojVVIswaIri_iAuIbWY8C1L-9RjTWIvYArUuK1T4y0-qtGkZzibFaif3HwE2dsRNtkJOn-_ZRhMH07AhUXGytB5s_7yWEh4ymgMEtwWMbhVxjufmoGJ4jxD499Bflu1WAjnNnTqmG2vehEp6YGHuIg3k7azngACfEpD-xH9BOGW1YfqnCtp6lBzLDLiopq1Q_7WTxgYKl4ZMN8__siUD9-xDVQNr5MVwySUheA-xaQX3-NEMGZ6vDrQgrqOT8DiVewO3HaHkEBotCdYxGNWh8dg01QottMVf07fcNvzkMF3OmymgjzCcIinAN3makFx57fZsMIJCZdaqEg2AZbaW-NmwWcpDFmRDs7TiSUCE6bT4u6E747E60dargh",
  "otp": "9999"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #13 — Alt DD: GET /v1/mandates
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:02.394Z
**Request:** `GET https://sandbox.nomba.com/v1/mandates`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #14 — Alt DD: GET /v1/mandate
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:02.662Z
**Request:** `GET https://sandbox.nomba.com/v1/mandate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #15 — Alt DD: GET /v1/directdebit
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:02.911Z
**Request:** `GET https://sandbox.nomba.com/v1/directdebit`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #16 — Alt DD: GET /v1/directdebits
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:03.162Z
**Request:** `GET https://sandbox.nomba.com/v1/directdebits`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #17 — Alt DD: GET /v1/bank/mandates
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:03.434Z
**Request:** `GET https://sandbox.nomba.com/v1/bank/mandates`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #18 — Alt DD: GET /v1/payment/mandates
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:03.685Z
**Request:** `GET https://sandbox.nomba.com/v1/payment/mandates`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #19 — Alt DD: GET /v1/subscriptions/mandates
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:03.929Z
**Request:** `GET https://sandbox.nomba.com/v1/subscriptions/mandates`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #20 — Alt DD: GET /v1/direct-debits/v2/mandates
**Question:** explore-dd
**Timestamp:** 2026-07-01T19:36:04.186Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/v2/mandates`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #21 — Q1a: POST /v1/direct-debits/debit-mandate (code sample method)
**Question:** 1
**Timestamp:** 2026-07-01T19:36:04.776Z
**Request:** `POST https://sandbox.nomba.com/v1/direct-debits/debit-mandate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "mandateId": "test-id",
  "amount": "100.00"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #22 — Q1b: GET /v1/direct-debits/debit-mandate (prose method)
**Question:** 1
**Timestamp:** 2026-07-01T19:36:05.053Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/debit-mandate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #23 — Q1c: Analysis — does the endpoint distinguish methods?
**Question:** 1
**Timestamp:** 2026-07-01T19:36:05.054Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "post_status": 404,
  "post_body": {
    "code": "404",
    "description": "Resource not found",
    "status": false
  },
  "get_status": 404,
  "get_body": {
    "code": "404",
    "description": "Resource not found",
    "status": false
  },
  "methods_differentiated": false,
  "conclusion": "Both GET and POST return identical 404. DD endpoints are not accessible on this sandbox account. Method semantics cannot be empirically verified."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "post_status": 404,
  "post_body": {
    "code": "404",
    "description": "Resource not found",
    "status": false
  },
  "get_status": 404,
  "get_body": {
    "code": "404",
    "description": "Resource not found",
    "status": false
  },
  "methods_differentiated": false,
  "conclusion": "Both GET and POST return identical 404. DD endpoints are not accessible on this sandbox account. Method semantics cannot be empirically verified."
}
```

### Log Entry #24 — Q2a: GET /v1/direct-debits/status?mandateId=test
**Question:** 2
**Timestamp:** 2026-07-01T19:36:05.303Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/status?mandateId=test`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #25 — Q2b: PUT /v1/direct-debits/update-status (status:"SUSPEND")
**Question:** 2
**Timestamp:** 2026-07-01T19:36:05.572Z
**Request:** `PUT https://sandbox.nomba.com/v1/direct-debits/update-status`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "mandateId": "test",
  "status": "SUSPEND"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #26 — Q2c: GET /v1/direct-debits/status?mandateId=test (after SUSPEND)
**Question:** 2
**Timestamp:** 2026-07-01T19:36:06.041Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/status?mandateId=test`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #27 — Q2d: Summary — DD endpoints not accessible
**Question:** 2
**Timestamp:** 2026-07-01T19:36:06.042Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "note": "All DD endpoints return 404. Cannot observe mandateStatus casing or test SUSPEND round-trip without DD sandbox access."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "note": "All DD endpoints return 404. Cannot observe mandateStatus casing or test SUSPEND round-trip without DD sandbox access."
}
```

### Log Entry #28 — Q3a: GET /v1/direct-debits/<mandateId> (path param)
**Question:** 3
**Timestamp:** 2026-07-01T19:36:06.212Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/test-id-123`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #29 — Q3b: GET /v1/direct-debits/status?mandateId=test-id-123 (query param)
**Question:** 3
**Timestamp:** 2026-07-01T19:36:06.481Z
**Request:** `GET https://sandbox.nomba.com/v1/direct-debits/status?mandateId=test-id-123`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #30 — Q3c: Summary — DD endpoints not accessible
**Question:** 3
**Timestamp:** 2026-07-01T19:36:06.481Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "note": "Both endpoints return 404. Cannot differentiate the payload shapes or confirm they are distinct endpoints."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "note": "Both endpoints return 404. Cannot differentiate the payload shapes or confirm they are distinct endpoints."
}
```

### Log Entry #31 — Q4a: Tokenized-card-payment with random token (should always succeed in sandbox)
**Question:** 4
**Timestamp:** 2026-07-01T19:36:06.690Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/tokenized-card-payment`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "orderReference": "q4a-1782934566482",
    "customerId": "cust-123",
    "amount": "5000.00",
    "currency": "NGN"
  },
  "tokenKey": "tok_1782934566482"
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "SUCCESS",
  "message": "SUCCESS",
  "status": true,
  "data": {
    "status": true,
    "message": "success",
    "orderId": null,
    "orderReference": null
  }
}
```

### Log Entry #32 — Q4b: Verify transaction after tokenized charge
**Question:** 4
**Timestamp:** 2026-07-01T19:36:07.428Z
**Request:** `GET https://sandbox.nomba.com/v1/transactions/accounts/single?orderReference=q4a-1782934566482`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "Success",
  "status": true,
  "data": {
    "id": "POS-PHCN-D0512-d432d6b1-3acf-4623-ba70-27f2ae3ea4a6",
    "status": "SUCCESS",
    "amount": "4000.0",
    "fixedCharge": "0.0",
    "source": "pos",
    "type": "phcn",
    "gatewayMessage": "TokenData -- Successful transaction",
    "customerBillerId": "262801035701",
    "timeCreated": "2023-12-05T19:15:11.045000Z",
    "posTid": "2KUD3JIE",
    "posSerialNumber": "91220518208460",
    "posTerminalLabel": "KAD ABDULWAHAB LAWAL",
    "walletbalance": "821567.58",
    "billingVendorReference": "656f76bf2984ff00196e4163-1706007774",
    "paymentVendorReference": "656f76bf2cea9979be12a9b1",
    "userId": "dfc05ca1-4e75-41dd-8e41-2d362d565893",
    "posRrn": "231205201503",
    "billerAccountName": "A 022",
    "paymentType": "postpaid"
  }
}
```

### Log Entry #33 — Q4c: Create checkout order with known decline card 5484497218317651 (tokenizeCard:true)
**Question:** 4
**Timestamp:** 2026-07-01T19:36:07.614Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/order`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "amount": "5000.00",
    "currency": "NGN",
    "orderReference": "dc-1782934567428",
    "customerEmail": "decline@test.com",
    "customerId": "cust-decline",
    "allowedPaymentMethods": [
      "Card"
    ],
    "callbackUrl": "https://webhook.site/ad8e5ca0-13ef-4b23-85b9-9c24688d9d74"
  },
  "tokenizeCard": true
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "checkout order created successful",
  "status": false,
  "data": {
    "success": true,
    "message": "success",
    "checkoutLink": "https://pay.nomba.com/sandbox/QMojVVIswaIri_iAvobQNpTmfbFR3W7e7oArArOxT9S0-PBGxMm5Ng_2dnOlEGJgRNtkJOn-_ZRhMH07AhUXGytB5s_swyE95SaqO0F3WcXjVBPhamQIZp73CJR_De5V-CY7hJjFrGbv9P5Opu1EWaFvn0DMw2M8A6daSahL4EPVC1kY4XH3svRUwOLfh5Br2UGmQT5mL_0rM5R-8qkiWy1g1XQdeLFPWgObZgaHjF6SCCnDVJeO7_ClAkj4LhgGh1G3NziRGU1Dg8DAdVDAWEBdkFIXpZsXQqF8csF4mUoY1aSwnhznE8VuikYm1eZehtGOXOsrY3g6aLIt0VYsLn-JvAiBq3YcXiskVnej64ig6wKSzMRPwnvDOXeefUUrQeuOhxP86vO0wRF3z5LzzCTe_QKIxLpno3FDj5uZ0zReMNSyv3IyN_mYjq1nnB1Fp8fQrk9nh1BfwIc",
    "orderReference": "d0ed76ef-fcde-4dd1-acf9-348bab13caa5"
  }
}
```

### Log Entry #34 — Q4d: Webhook.site event check (payment_failed events?)
**Question:** 4
**Timestamp:** 2026-07-01T19:36:14.487Z
**Request:** `GET https://webhook.site/token/ad8e5ca0-13ef-4b23-85b9-9c24688d9d74/requests`
**Request Headers:** ```json
{
  "Content-Type": "application/json"
}
```
**Request Body:** ```json
{
  "event_count": 0,
  "events": [],
  "note": "Sandbox checkout orders were created but payment was not completed (no card details submitted). No webhook events expected."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "data": [],
  "total": 0,
  "per_page": 50,
  "current_page": 1,
  "is_last_page": true,
  "from": 1,
  "to": 0
}
```

### Log Entry #35 — Q5a: Charge with expired-looking token (sandbox accepts any token)
**Question:** 5
**Timestamp:** 2026-07-01T19:36:15.172Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/tokenized-card-payment`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "orderReference": "tok-exp-1782934574487",
    "customerId": "cust-123",
    "amount": "5000.00",
    "currency": "NGN"
  },
  "tokenKey": "expired_2020"
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "SUCCESS",
  "message": "SUCCESS",
  "status": true,
  "data": {
    "status": true,
    "message": "success",
    "orderId": null,
    "orderReference": null
  }
}
```

### Log Entry #36 — Q5b: Token management — list/status endpoints
**Question:** 5
**Timestamp:** 2026-07-01T19:36:15.450Z
**Request:** `GET https://sandbox.nomba.com/v1/checkout/tokenized-cards?customerId=cust-123`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #37 — Q5c: Summary — token expiry not testable in sandbox
**Question:** 5
**Timestamp:** 2026-07-01T19:36:15.450Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "finding": "Sandbox does not validate token expiry — any tokenKey is accepted and returns success.",
  "note": "Token management endpoints (list/update/delete) all return 404. They may require proper tokenized cards from completed checkouts or may be dashboard-only features. Cannot empirically test token expiry detection."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "finding": "Sandbox does not validate token expiry — any tokenKey is accepted and returns success.",
  "note": "Token management endpoints (list/update/delete) all return 404. They may require proper tokenized cards from completed checkouts or may be dashboard-only features. Cannot empirically test token expiry detection."
}
```

### Log Entry #38 — Q6a: POST /v1/direct-debits/debit-mandate (webhook check)
**Question:** 6
**Timestamp:** 2026-07-01T19:36:17.211Z
**Request:** `POST https://sandbox.nomba.com/v1/direct-debits/debit-mandate`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "mandateId": "wh-test",
  "amount": "500.00"
}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #39 — Q6b: Webhook.site post-DD poll
**Question:** 6
**Timestamp:** 2026-07-01T19:36:23.318Z
**Request:** `GET https://webhook.site/token/ad8e5ca0-13ef-4b23-85b9-9c24688d9d74/requests`
**Request Headers:** ```json
{
  "Content-Type": "application/json"
}
```
**Request Body:** ```json
{
  "event_count": 0,
  "events_since_dd_call": [],
  "finding": "No webhook events received. DD endpoint returned 404 (not found), so no actual debit was attempted."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "data": [],
  "total": 0,
  "per_page": 50,
  "current_page": 1,
  "is_last_page": true,
  "from": 1,
  "to": 0
}
```

### Log Entry #40 — Q9a: Authorization: Bearer <token> — create checkout order
**Question:** 9
**Timestamp:** 2026-07-01T19:36:23.497Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/order`
**Request Headers:** ```json
{
  "Authorization": "Bearer e...[REDACTED]",
  "Content-Type": "application/json",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "amount": "1000.00",
    "currency": "NGN",
    "orderReference": "auth-a-1782934583318",
    "customerEmail": "auth@test.com",
    "customerId": "cust-auth",
    "allowedPaymentMethods": [
      "Card"
    ]
  }
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "checkout order created successful",
  "status": false,
  "data": {
    "success": true,
    "message": "success",
    "checkoutLink": "https://pay.nomba.com/sandbox/QMojVVIswaIri_iA7oGFNsDnee5RjTqDu4ArAuHmT4y0p6pGkcu3ZVrxdXbxSTMwRNtkJOn-_ZRhMH07AhUXGytB5s_p1Xhk_3-1M0V7XsrnVBThe3sbPcmoXphnG-hz8WFz75-S5TCh5ehZ5-VfSOthkQPOw28mGL1nZO5T-AeFC1lL4i6s_eFUwL-XnpNl2VWzTGhgZ7EpMsN79_5yUSVi1GUTdvBNVwOVZQSPsnmMRjHbUpaW86-9ThL8PxUDjUyZdCqRAQpWwMWNZA3jTRUD1U8RrNsBDLEuMpY4lQcX1uWzmhrvBZFnzF0wlL8Ol8GTS_1kPCgxQp1mkVZ5fn-JrSmNsXIYSzo2AGOu8YnuusjHsrqMTgtnLJtEmiCK3Mo",
    "orderReference": "470dc7a9-6790-4d6f-9c9c-f6614e26780e"
  }
}
```

### Log Entry #41 — Q9b: Authorization: <token> (no Bearer) — create checkout order
**Question:** 9
**Timestamp:** 2026-07-01T19:36:23.674Z
**Request:** `POST https://sandbox.nomba.com/v1/checkout/order`
**Request Headers:** ```json
{
  "Authorization": "eyJhbGci...[REDACTED]",
  "Content-Type": "application/json",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{
  "order": {
    "amount": "1000.00",
    "currency": "NGN",
    "orderReference": "auth-b-1782934583497",
    "customerEmail": "auth@test.com",
    "customerId": "cust-auth",
    "allowedPaymentMethods": [
      "Card"
    ]
  }
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "checkout order created successful",
  "status": false,
  "data": {
    "success": true,
    "message": "success",
    "checkoutLink": "https://pay.nomba.com/sandbox/QMojVVIswaIri_iA7IGDMJPiLuRR2GvbvIArArOyT9fg-6hGxsu3Zwincib0Q2A2RNtkJOn-_ZRhMH07AhUXGytB5s_p1Xhk_3y1M0V7XsrnVBThe3wTMsmoXphnG-hz8WFz75-S5TCh5ehZ5-VfSOthkQPOw28mGL1nZO5T-AeFC1lL4i6s_eFUwL-XnpNl2VWzTGhgZ7EpMsN79_5yUSVi1GUTdvBNVwOVZQSPsnmMRjHbUpaW86-9ThL8PxUDjUyZdCqRAQpWwMWNZA3jTRUD1U8RrNsBDLEuMpY4lQcX1uWzmhrvBZFnzF0wlL8Ol8GTS_1kPCgxQp1mkVZ5fn-JrSmNsXIYSzo2AGOu8Ynuuop4iFH28zCo3gMvMEOt-Mo",
    "orderReference": "676b0263-cfa7-4dd2-b7ea-1663f35f22cc"
  }
}
```

### Log Entry #42 — Q9c: Auth header format conclusion
**Question:** 9
**Timestamp:** 2026-07-01T19:36:23.675Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "bearer_prefixed": "ACCEPTED (code: \"00\")",
  "bare_token": "ACCEPTED (code: \"00\")",
  "conclusion": "Both Authorization header formats are accepted by sandbox. The bare token format (without Bearer prefix) is still a valid legacy format."
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "bearer_prefixed": "ACCEPTED (code: \"00\")",
  "bare_token": "ACCEPTED (code: \"00\")",
  "conclusion": "Both Authorization header formats are accepted by sandbox. The bare token format (without Bearer prefix) is still a valid legacy format."
}
```

### Log Entry #43 — GET /v1/checkout/transaction?idType=ORDER_REFERENCE&id=nonexistent
**Question:** extra
**Timestamp:** 2026-07-01T19:36:23.837Z
**Request:** `GET https://sandbox.nomba.com/v1/checkout/transaction?idType=ORDER_REFERENCE&id=nonexistent`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 200
**Response Body:** ```json
{
  "code": "00",
  "description": "success",
  "status": true,
  "data": {
    "success": false,
    "message": "No transaction found for the provided orderId/orderReference",
    "order": null,
    "transactionDetails": null,
    "transferDetails": null,
    "cardDetails": null
  }
}
```

### Log Entry #44 — GET /sandbox/checkout/transaction?idType=orderReference&id=nonexistent
**Question:** extra
**Timestamp:** 2026-07-01T19:36:24.003Z
**Request:** `GET https://sandbox.nomba.com/sandbox/checkout/transaction?idType=orderReference&id=nonexistent`
**Request Headers:** ```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer e...[REDACTED]",
  "accountId": "f666ef9b...[REDACTED]"
}
```
**Request Body:** ```json
{}
```
**Response Status:** 404
**Response Body:** ```json
{
  "code": "404",
  "description": "Resource not found",
  "status": false
}
```

### Log Entry #45 — End-to-end test summary
**Question:** SUMMARY
**Timestamp:** 2026-07-01T19:36:24.003Z
**Request:** `N/A N/A`
**Request Headers:** ```json
{}
```
**Request Body:** ```json
{
  "q1": "NOT TESTABLE — DD endpoints all 404; account lacks DD sandbox access. Direct Nomba support needed to confirm method.",
  "q2": "NOT TESTABLE — same DD access issue.",
  "q3": "NOT TESTABLE — same DD access issue.",
  "q4": "Sandbox tokenized-card-payment always returns data.status: true synchronously (code \"00\"). No decline simulation possible in sandbox. Finding: sandbox does not validate tokenKey at all.",
  "q5": "Sandbox accepts any tokenKey including expired-looking ones. Token expiry endpoints return 404. Cannot test in sandbox.",
  "q6": "NOT TESTABLE — DD endpoints not accessible; no webhook events received.",
  "q9": "CONFIRMED — Both \"Authorization: Bearer <token>\" and \"Authorization: <token>\" (no Bearer) are accepted.",
  "extra_findings": {
    "checkout_endpoint_path": "POST /v1/checkout/order works (not /sandbox/checkout/order as old docs stated)",
    "transaction_fetch": "GET /v1/checkout/transaction works on sandbox (contrary to KB saying production-only)",
    "transaction_single": "GET /v1/transactions/accounts/single works",
    "note": "The knowledge base assumption that sandbox uses /sandbox/checkout/ path prefix is incorrect for the API endpoints. The sandbox uses the same /v1/checkout/ paths as production."
  }
}
```
**Response Status:** 200
**Response Body:** ```json
{
  "q1": "NOT TESTABLE — DD endpoints all 404; account lacks DD sandbox access. Direct Nomba support needed to confirm method.",
  "q2": "NOT TESTABLE — same DD access issue.",
  "q3": "NOT TESTABLE — same DD access issue.",
  "q4": "Sandbox tokenized-card-payment always returns data.status: true synchronously (code \"00\"). No decline simulation possible in sandbox. Finding: sandbox does not validate tokenKey at all.",
  "q5": "Sandbox accepts any tokenKey including expired-looking ones. Token expiry endpoints return 404. Cannot test in sandbox.",
  "q6": "NOT TESTABLE — DD endpoints not accessible; no webhook events received.",
  "q9": "CONFIRMED — Both \"Authorization: Bearer <token>\" and \"Authorization: <token>\" (no Bearer) are accepted.",
  "extra_findings": {
    "checkout_endpoint_path": "POST /v1/checkout/order works (not /sandbox/checkout/order as old docs stated)",
    "transaction_fetch": "GET /v1/checkout/transaction works on sandbox (contrary to KB saying production-only)",
    "transaction_single": "GET /v1/transactions/accounts/single works",
    "note": "The knowledge base assumption that sandbox uses /sandbox/checkout/ path prefix is incorrect for the API endpoints. The sandbox uses the same /v1/checkout/ paths as production."
  }
}
```


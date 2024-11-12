// What are action modules
// They are generic code that can be used in actions.
// They receive a schema and execute the action.

/**
 * request: receives an object containing the schemas for performing an http request, and validating its response.
 * request (inputSchema, outputSchema) => (data)=> action
 * inputSchema: {body, query, path}
 * outputSchema: {body, status}
 */


async function request(params) {

    console.log('request', params);

    // const { url, method, headers = {}, body, queryParams = {}, pathParams = {} } = this;
    const { schemas, options, config } = this || {};
    // Substitute pathParams in URL

    let url = new URL(options.path, config.baseUrl).href

    // Validate data against schemas
    const data = {};
    schemas.forEach(({ key, validator }) => ['body', 'query', 'path', 'headers'].includes(key) && (data[key] = validator(params)));

    console.log('schemas', schemas);
    // Substitute pathParams in URL
    data.path && Object.keys(data.path).forEach(key => {
        url = url.replace(`:${key}`, data.path[key]);
    });

    // Add queryParams to URL
    const queryString = new URLSearchParams(data.query).toString();
    if (queryString) {
        url += `?${queryString}`;
    }

    console.log('data', data);

    // Configure request options
    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...config.headers, ...data.headers,
        },
        body: data.body ? JSON.stringify(data.body) : undefined
    };

    try {
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            throw { status: response.status, statusText: response.statusText };
        }

        const resBody = await response.text();
        let res;
        try {
            res = JSON.parse(resBody);
        } catch (_) { }

        return res;

    } catch (error) {
        console.error('Error processing request:', error, {
            url,
            method: options.method,
            body: data.body,
            query: data.query,
            path: data.path,
            headers: data.headers,
        });
        throw error;
    }
};

export default request;
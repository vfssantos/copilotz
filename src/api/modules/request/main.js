const request = async (url, { method, headers = {}, body, queryParams = {}, pathParams = {} } = {}) => {


    // Substitute pathParams in URL
    Object.keys(pathParams).forEach(key => {
        url = url.replace(`:${key}`, pathParams[key]);
    });

    // Add queryParams to URL
    const queryString = new URLSearchParams(queryParams).toString();
    if (queryString) {
        url += `?${queryString}`;
    }

    // Configure request options
    const options = {
        method: method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: body ? JSON.stringify(body) : undefined
    };

    try {
        const response = await fetch(url, options);

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
            method,
            body,
            queryParams,
            pathParams,
        });
        throw error;
    }
};

export default request;
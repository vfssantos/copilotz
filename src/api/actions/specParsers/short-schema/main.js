
async function shortSchema({ schema, module }) {
    const fn = async (data) => {
        const result = await module(data)
        return result;
    }
    fn.spec = shortSchemaToSpec(schema, {});
    Object.assign(fn, shortSchema)
    return fn;
}

// New recursive function to transform shortSchema to string specification
const shortSchemaToSpec = (schema, parentKey = '') => {
    if (typeof schema !== 'object' || schema === null) {
        return `${parentKey}<${getType(schema)}>`;
    }

    const specs = [];

    for (const [key, value] of Object.entries(schema)) {
        const fullKey = parentKey ? `${parentKey}.${key}` : key;

        if (Array.isArray(value)) {
            if (value.length === 0) {
                specs.push(`${fullKey}<array>`);
            } else if (typeof value[0] === 'object' && value[0] !== null) {
                specs.push(`${fullKey}<array>: ${shortSchemaToSpec(value[0], '')}`);
            } else {
                specs.push(`${fullKey}<array of ${getType(value[0])}>`);
            }
        } else if (typeof value === 'object' && value !== null) {
            const nestedSpecs = shortSchemaToSpec(value, fullKey);
            specs.push(nestedSpecs);
        } else {
            specs.push(`${fullKey}<${getType(value)}>`);
        }
    }

    return specs.join(', ');
};

const getType = (value) => {
    if (typeof value === 'string') {
        if (value.includes('!')) return 'required ' + value.replace('!', '');
        if (value.includes('?')) return 'optional ' + value.replace('?', '');
        if (value.includes('^')) return 'unique ' + value.replace('^', '');
        if (value.includes('->')) return 'reference to ' + value.split('->')[1];
        return value;
    }
    return typeof value;
};

export default shortSchema;

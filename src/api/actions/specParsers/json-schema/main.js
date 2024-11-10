import validate from "axion-modules/connectors/validator.ts";

const jsonSchema = async ({specs, config}) => {

    const shortedSchema = jsonSchemaToShortSchema(specs, { detailed: false });
    const functionSpec = jsonSchemaToFunctionSpec(specs, config.name);
    const validator = data => validate(jsonSchemaToShortSchema(specs), data);

    return {
       globals:{},
       actions:[
        {
            name: config.name,
            schemas: [
                {
                    key: "$",
                    value: shortedSchema,
                    validator: validator
                }
            ],
            spec: functionSpec
        }
       ]
    }
}

function jsonSchemaToFunctionSpec(jsonSchema, functionName = '') {
    const properties = jsonSchema.properties || {};
    const required = jsonSchema.required || [];

    function formatType(type, format) {
        if (type === 'integer') return 'number';
        if (type === 'string' && format === 'date-time') return 'date';
        return type || 'any';
    }

    function formatDescription(description) {
        return description ? ` (${description})` : '';
    }

    function formatArgument(name, schema) {
        const type = formatType(schema.type, schema.format);
        const isRequired = required.includes(name);
        const prefix = isRequired ? '!' : '';
        const description = formatDescription(schema.description);
        return `${prefix}${name}<${type}>${description}`;
    }

    function formatNestedObject(name, schema) {
        const nestedSpec = jsonSchemaToFunctionSpec(schema, name);
        return nestedSpec.split('\n').map(line => `  ${line}`).join('\n');
    }

    const args = Object.entries(properties)
        .map(([name, schema]) => {
            if (schema.type === 'object' && schema.properties) {
                return formatNestedObject(name, schema);
            }
            return formatArgument(name, schema);
        })
        .join(', ');

    const functionDescription = jsonSchema.description || '';
    const functionSpec = `${functionName}${formatDescription(functionDescription)}: ${args}`;

    return functionSpec;
}


function jsonSchemaToShortSchema(jsonSchema, { detailed } = {}) {

    detailed = detailed ?? false;

    function convertType(type) {
        switch (type) {
            case 'string':
                return 'string';
            case 'number':
            case 'integer':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'object':
                return 'object';
            case 'array':
                return 'array';
            case 'null':
                return 'null';
            default:
                return 'any';
        }
    }

    function formatProperties(properties, required = []) {
        const result = {};
        for (const key in properties) {
            const prop = properties[key];
            const type = convertType(prop.type);
            const isRequired = required.includes(key);
            const suffix = isRequired ? '!' : '?';
            const description = detailed && prop.description ? ` ${prop.description}` : '';
            if (type === 'object' && prop.properties) {
                result[key] = formatProperties(prop.properties, prop.required);
            } else if (type === 'array' && prop.items) {
                result[key] = [formatProperties(prop.items.properties, prop.items.required)];
            } else {
                result[key] = description ? `<${type + suffix}>${description}</${type + suffix}>` : type + suffix;
            }
        }
        return result;
    }

    return formatProperties(jsonSchema.properties, jsonSchema.required);
}



// Attach the function specification and description to the function object
// Test function
function testJsonSchema(schema, functionName = '') {
    const shortSchema = jsonSchemaToShortSchema(schema, { detailed: false });
    const functionSpec = jsonSchemaToFunctionSpec(schema, functionName);

    console.log('Input Schema:', JSON.stringify(schema, null, 2));
    console.log('Short Schema:', JSON.stringify(shortSchema, null, 2));
    console.log('Function Spec:', functionSpec);
    console.log('---');
}

// Example 1: Function with array of primitive types
const arrayOfPrimitivesSchema = {
    type: 'object',
    description: 'Add items to a shopping list',
    properties: {
        items: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of items to add'
        },
        urgency: {
            type: 'integer',
            enum: [1, 2, 3],
            description: 'Urgency level (1-3)'
        }
    },
    required: ['items']
};

// Example 2: Function with nested arrays
const nestedArraysSchema = {
    type: 'object',
    description: 'Create a weekly meal plan',
    properties: {
        mealPlan: {
            type: 'array',
            items: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            description: 'Array of 7 days, each containing an array of meal names'
        }
    },
    required: ['mealPlan']
};

// Example 3: Function with complex nested structure and additional properties
const complexNestedSchema = {
    type: 'object',
    description: 'Process a complex order with custom fields',
    properties: {
        orderId: { type: 'string', description: 'Unique order identifier' },
        customer: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                contactInfo: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' },
                        phone: { type: 'string' }
                    },
                    required: ['email']
                }
            },
            required: ['name', 'contactInfo']
        },
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'integer', minimum: 1 },
                    customizations: {
                        type: 'object',
                        additionalProperties: true,
                        description: 'Custom fields for the product'
                    }
                },
                required: ['productId', 'quantity']
            }
        },
        specialInstructions: { type: 'string' }
    },
    required: ['orderId', 'customer', 'items'],
    additionalProperties: false
};

// Example 4: Function with various data formats
const dataFormatsSchema = {
    type: 'object',
    description: 'Schedule an appointment',
    properties: {
        appointmentDate: { type: 'string', format: 'date-time', description: 'Date and time of the appointment' },
        duration: { type: 'integer', minimum: 15, maximum: 120, description: 'Duration in minutes (15-120)' },
        patientInfo: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                dateOfBirth: { type: 'string', format: 'date' },
                weight: { type: 'number', description: 'Weight in kg' },
                height: { type: 'number', description: 'Height in cm' },
                isNewPatient: { type: 'boolean' }
            },
            required: ['name', 'dateOfBirth']
        },
        reasonForVisit: { type: 'string', maxLength: 500 }
    },
    required: ['appointmentDate', 'duration', 'patientInfo']
};

// Example 5: Function with empty object (edge case)
const emptyObjectSchema = {
    type: 'object',
    description: 'An empty function for testing purposes',
    properties: {}
};


const runTests = () => {
    testJsonSchema(arrayOfPrimitivesSchema, 'addToShoppingList');
    testJsonSchema(nestedArraysSchema, 'createMealPlan');
    testJsonSchema(complexNestedSchema, 'processComplexOrder');
    testJsonSchema(dataFormatsSchema, 'scheduleAppointment');
    testJsonSchema(emptyObjectSchema, 'emptyFunction');
}

export default jsonSchema;

export {
    jsonSchemaToFunctionSpec,
    jsonSchemaToShortSchema
}
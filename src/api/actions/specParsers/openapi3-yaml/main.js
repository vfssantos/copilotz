import YAML from "npm:yaml";
import validate from 'axion-modules/connectors/validator.ts';
import { jsonSchemaToFunctionSpec, jsonSchemaToShortSchema } from '../json-schema/main.js';

// Add this new function to transform parameters to JSON Schema
const paramsToJsonSchema = (parameters) => {
  if (!parameters || !parameters.length) return [];

  const schemas = {}

  const schema = {
    type: 'object',
    properties: {},
    required: []
  };

  parameters.forEach(param => {
    const { name, required, schema: paramSchema, in: paramIn } = param;

    // Skip if not query, header, or path parameter
    if (!['query', 'header', 'path'].includes(paramIn)) return;

    // Add property to schema
    if (schemas[paramIn]) {
      schemas[paramIn].properties[name] = {
        ...paramSchema,
        description: param.description || undefined
      };
    } else {
      schemas[paramIn] = {
        properties: {
          [name]: {
            ...paramSchema,
            description: param.description || undefined
          }
        },
        type: 'object',
        required: []
      }
    }

    // Add to required array if parameter is required
    if (required) {
      schemas[paramIn].required.push(name);
    }
  });

  // Remove required array if empty
  if (schemas[paramIn].required.length === 0) {
    delete schemas[paramIn].required;
  }
  return Object.entries(schema).map(([key, value]) => ({ key, value, validator: data => validate(jsonSchemaToShortSchema(value), data) }));
};

const ParseOpenApiSpec = ({ specs, ...tool }) => {

  const { parse } = YAML;

  if (!specs) return;

  const operationIds = [];

  const { paths, servers, components } = parse(specs);

  const baseUrl = servers[0].url;

  const globals = {
    baseUrl,
    headers: {},
    query: {},
    body: {},
  };

  const actions = [];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {

      const action = {};
      action.name = details.operationId;
      action.schemas = [];
      action.options = {
        method,
        path,
      }

      const summary = details.summary;
      const parameters = details.parameters || [];
      const args = [];
      const responses = details.responses || {};


      // Adding POST / JSON params
      if (details.requestBody && details.requestBody.content) {
        const content = details.requestBody.content["application/json"];
        if (content && content.schema) {
          const bodyJsonSchema = content.schema;
          action.schemas.push({
            key: "body",
            value: bodyJsonSchema,
            validator: data => validate(jsonSchemaToShortSchema(bodyJsonSchema), data),
          });
        }
      }

      const parameterSchemas = paramsToJsonSchema(parameters);
      const parameterSpecs = jsonSchemaToFunctionSpec(parameterSchemas);

      action.schemas = [...action.schemas, ...parameterSchemas];

      const inputObject = action.schemas.reduce((acc, schema) => {
        mergeDeep(acc, schema.value);
        return acc;
      }, {});

      const inputSpec = jsonSchemaToFunctionSpec(inputObject);

      // Combine all the parts
      let outputDescription = '';
      if (responses["200"]?.content?.["application/json"]?.schema) {
        outputDescription = responses["200"].description;
        const schema = responses["200"].content["application/json"].schema;

        action.schemas.push({
          key: "response",
          value: schema,
          validator: data => validate(jsonSchemaToShortSchema(schema), data),
        })
      }

      const outputObject = action.schemas.reduce((acc, schema) => {
        mergeDeep(acc, schema.value);
        return acc;
      }, {});

      const outputSpec = jsonSchemaToFunctionSpec({ ...outputObject, description: outputDescription });

      const spec = `(${summary})${inputSpec}->${outputSpec}`;
      action.spec = spec;

      actions.push(action);

    }
  }

  const auth = {};
  // get auth specs
  components?.securitySchemes && Object.entries(components.securitySchemes).forEach(([key, data]) => {
    const { type, name, flows, description, scheme, in: location } = data;
    if (type === "http" && scheme === "bearer") {
      auth.type = "bearer";
      auth.actionName = tool?.auth?.loginOperationId || 'login';
    }
    else if (type === "http" && scheme === "basic") {
      auth.type = "basic";
      globals.headers["Authorization"] = `Basic ${btoa(`${tool.auth?.credentials?.username}:${tool.auth?.credentials?.password}`)}`;
    }
    else if (type === "apiKey") {
      auth.type = "apiKey";
      globals[location][name] = tool.auth?.credentials?.[name];
    }
  });

  const getBearerToken = async () => {
    const loginAction = actions[tool?.[auth?.loginOperationId] || 'login'];
    const token = await loginAction(tool?.auth?.credentials).then(res => res?.[tool?.auth?.tokenPath || 'access_token']);
    return token;
  };

  const resolver = new Promise((resolve) => {
    if (auth.type === "bearer") {
      getBearerToken().then((token) => {
        globals.headers["Authorization"] = `Bearer ${token}`;
        resolve();
      });
    } else {
      resolve();
    }
  });


  return {
    globals,
    actions
  };

};

export default ParseOpenApiSpec;


const isObject = (item) => item && typeof item === 'object' && !Array.isArray(item);

const mergeDeep = (target, source) => {
  if (!target) return source;
  if (Array.isArray(source)) {
    return Array.isArray(target) ? [...target, ...source] : source;
  }
  if (isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        target[key] = mergeDeep(target[key] || {}, source[key]);
      } else if (Array.isArray(source[key])) {
        target[key] = mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }
  return source;
};
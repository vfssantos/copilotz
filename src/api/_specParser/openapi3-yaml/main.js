import YAML from "npm:yaml";
import validate from 'axion-modules/connectors/validator.ts';

const ParseOpenApiSpec = ({ spec, module: request }) => {

  const { parse } = YAML;

  const actions = {};

  if (!spec) return;

  const operationIds = [];

  const { paths, servers, components } = parse(spec);

  const baseUrl = servers[0].url;

  const globals = {
    headers: {},
    query: {},
    body: {},
  };

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {

      const operationId = details.operationId;
      operationIds.push(operationId);
      const summary = details.summary;
      const parameters = details.parameters || [];
      const args = [];
      const responses = details.responses || {};

      const schema = { body: {}, query: {} };

      // Adding POST / JSON params
      if (details.requestBody && details.requestBody.content) {
        const content = details.requestBody.content["application/json"];
        if (content && content.schema && content.schema.properties) {
          Object.entries(content.schema.properties).forEach(
            ([paramName, paramDetails]) => {
              schema.body[paramName] = paramDetails.type + (paramDetails.required ? "!" : "");
              args.push(
                `${details.requestBody.required ? "!" : ""}${paramName}<${paramDetails.type}>(${paramDetails.description || ""})`,
              );
            },
          );
        }
      }

      // Adding Query Params
      parameters.forEach((param) => {
        const required = param.required ? "!" : "";
        const paramName = param.name;
        const paramType = param.schema.type;
        const paramDescription = param.description;
        args.push(`${required}${paramName}<${paramType}>(${paramDescription})`);
        schema.query[paramName] = param.type + (param.required ? "!" : "");
      });

      const formattedArgs = args.join(", ");

      // Combine all the parts
      const responseParams = [];
      if (responses["200"]?.content?.["application/json"]?.schema?.properties) {
        const properties = responses["200"].content["application/json"].schema.properties;
        Object.entries(properties).forEach(([paramName, paramDetails]) => {
          responseParams.push(`${paramName}<${paramDetails.type}>`);
        });
      }
      
      const responseParamsStr = responseParams.length ? `{${responseParams.join(", ")}}` : "";
      const spec = `(${summary}):${formattedArgs}->(${responses["200"].description})${responseParamsStr}`;

      actions[operationId] = ({ _user, ...params }) => request(
        new URL(path, baseUrl).href,
        {
          method,
          headers: request?.globals?.headers,
          body: { ...validate(schema.body, { ...request?.globals?.body, ...params }), _user },
          query: validate(schema.query, { ...request?.globals?.query, ...params }),
        }
      );
      actions[operationId].spec = spec;
    }
  }

  const auth = {};
  // get auth specs
  components?.securitySchemes?.forEach((_scheme) => {
    const { type, name, flows, description, scheme, in: location } = _scheme;
    if (type === "http" && scheme === "bearer") {
      auth.type = "bearer";
      auth.actionName = tool?.auth?.loginOperationId;
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
    const loginAction = actions[tool?.auth?.loginOperationId];
    const token = await loginAction(tool?.auth?.credentials).then(res => res?.[tool?.auth?.[tokenPath]]);
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

  for (const operationId of operationIds) {
    // let action = actions[operationId];
    const action = actions[operationId];
    actions[operationId] = (params) => resolver.then(() => {
      action.globals = globals;
      return action(params)
    });
    const { ...methods } = action;
    Object.assign(actions[operationId], methods);
  }

  return actions;
};

export default ParseOpenApiSpec;

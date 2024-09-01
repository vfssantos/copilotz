export default ({ config, adapters, resources }) => async (params) => {
    const { tools } = resources;
    const { dynamicImport, utils, ...modules } = adapters;
    const { query, dependencies, actionName, ...data } = params;

    for (const tool of tools) {
        if (tool.type !== 'module') continue;
        if (tool.specType !== 'jsonSchema' || tool.spec.type !== 'object') continue;

        const mod = await dynamicImport({ keys: tool.key }, { config, adapters, resources, ...tool.defaults });
        const action = (_data) => mod[params?.actionName || 'default'](Object.assign(data, _data));
        // Adding Query Params
        const inputValidationSchema = {};

        const args = [];
        const { input: inputSchema, output: outputSchema, description, ...rest } = tool.spec.properties;
        Object.entries(inputSchema).forEach(
            ([paramName, paramDetails]) => {
                inputValidationSchema[paramName] = paramDetails.type + (paramDetails.required ? "!" : "");
                args.push(
                    `${details.requestBody.required ? "!" : ""}${paramName}<${paramDetails.type}>(${paramDetails.description || ""})`,
                );
            },
        );

        const formattedArgs = args.join(", ");
        const spec = `(${description}):${formattedArgs}->${outputSchema.description}}`;
        action.spec = spec;

    }

    return action

}
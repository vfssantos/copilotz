import validate from "axion-modules/connectors/validator.ts";

const validateShortSchema = ({ data, shortSchema }) => {
    const result = validate(shortSchema, data)
    return result;
}

export default validateShortSchema;

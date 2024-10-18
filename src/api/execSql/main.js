const execSQL = ({ sql }) => {
    const { models } = execSQL;
    const db = models[Object.keys(models)?.[0]];
    return await db.customQuery(sql);
};

export default execSQL
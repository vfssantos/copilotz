export default ({ ai, models, tenant, data }) => {
    return {
        createEmbedding: async (text) => {
            const embedding = await ai.embedding(text);
            return embedding
        },
        saveEmbedding: async ({ text, previous, next, embedding, parent, data }) => {
            return models.fragment.create({
                text,
                embedding,
                tenant,
                previous,
                parent,
                next,
                data
            });
        },
        search: async (query) => {
            // Embed the input query
            if (!data?.length) return [];
            const embeddedQuery = await ai.embedding(query);
            // Calculate the dot product of the input vector and each document's vector property
            const dotProduct = {
                $sum: {
                    $map: {
                        input: "$embedding",
                        as: "v",
                        in: {
                            $multiply: ["$$v", {
                                $arrayElemAt: [embeddedQuery, {
                                    $indexOfArray: ["$embedding", "$$v"],
                                }],
                            }],
                        },
                    },
                },
            };

            // Calculate the magnitude of each document's vector property
            const vectorMagnitude = { $sqrt: { $sum: { $map: { input: "$embedding", in: { $pow: ["$$this", 2] } } } } };

            // Calculate the magnitude of the input vector
            const inputMagnitude = Math.sqrt(
                embeddedQuery
                    .map((element) => (element * element))
                    .reduce((accumulator, element) => accumulator + element, 0),
            );

            // Calculate the cosine similarity between the input vector and each document's vector property
            const cosineSimilarity = {
                $divide: [dotProduct, { $multiply: [vectorMagnitude, inputMagnitude] }],
            };

            const matchStage = { tenant, data: { $in: data } }

            // Sort the documents by cosine similarity, highest to lowest
            const sortStage = { $sort: { cosineSimilarity: -1 } };

            const result = await models.embedding.customQuery([
                { $match: matchStage },
                {
                    $project: {
                        cosineSimilarity: cosineSimilarity,
                        _id: 1,
                        content: 1,
                    },
                },
                { $match: { cosineSimilarity: { $gt: 0.75 } } },
                sortStage,
                // { $limit: 3 },
            ]);

            return result;

            // // find with populate
            // const promises = result.map(async (r) => {
            //   // recursivelly populate next
            //   const depth = 4;
            //   const textArr = [];
            //   let fragment = r;
            //   textArr.push(fragment.text);
            //   for (let i = 0; i < depth; i++) {
            //     if (fragment.next) {
            //       fragment = await models.embedding.findOne({ _id: fragment.next }, { project: { text: 1, next: 1 } });
            //       textArr.push(fragment.text);
            //     }
            //   }
            //   return textArr.join('\n');
            // })
            // const res = await Promise.all(promises);
            // // return res.join('\n');
            // return res.filter((_, i) => i === 0);
            // return result.filter((_, i) => i ===).map((r) =>
            //   `${r.previous ? (r.previous?.text + "\n") : ""}${r.fragment}${r.next ? ("\n" + r.next?.text) : ""}`
            // );
        },
    };
};


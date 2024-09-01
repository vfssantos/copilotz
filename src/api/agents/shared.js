function createPrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return data[key] || '';
  });
}

export default (shared) => {
  return {
    ...shared,
    utils: {
      ...shared?.utils,
      createPrompt,
    }
  }
}

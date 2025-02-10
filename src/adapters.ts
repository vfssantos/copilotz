export default (modules: any) => {
    return {
        ...modules,
        permissions: {
            'unstable-otel': true
        }
    }

}
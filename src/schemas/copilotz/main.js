export default {
    "_id": "number",
    "name": "string!",
    "description": "string!",
    "backstory": "string!",
    "job": "number->jobs",
    "tools": ["number->tools"],
    "config": "number->configs",
}
import { assertEquals, assertExists, assertObjectMatch } from "jsr:@std/assert";
import actionExecutor from "./main.js";

// OpenAPI spec combining weather API and image endpoints
const specs = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /weather:
    get:
      operationId: getWeather
      summary: Get weather information
      parameters:
        - name: city
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Weather information
          content:
            application/json:
              schema:
                type: object
                properties:
                  temperature:
                    type: number
                  conditions:
                    type: string
                  city:
                    type: string
  /weather/forecast:
    post:
      operationId: getForecast
      summary: Get weather forecast
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - city
                - days
              properties:
                city:
                  type: string
                days:
                  type: number
      responses:
        '200':
          description: Weather forecast
          content:
            application/json:
              schema:
                type: object
                properties:
                  forecast:
                    type: array
                    items:
                      type: object
                      properties:
                        date:
                          type: string
                        temperature:
                          type: number
                        conditions:
                          type: string
  /image:
    get:
      operationId: getImage
      summary: Get a test image
      responses:
        '200':
          description: Returns a test image
          content:
            application/json:
              schema:
                type: object
                properties:
                  image:
                    type: string
                    description: Base64 encoded image
                  name:
                    type: string
                    description: Image name
  /binary-image:
    get:
      operationId: getBinaryImage
      summary: Get a test image as binary
      responses:
        '200':
          description: Returns a test image directly
          content:
            image/png:
              schema:
                type: string
                format: binary
`;

// Mock responses
const mockWeather = {
  temperature: 25,
  conditions: "Sunny",
  city: "New York",
};

const mockForecast = {
  forecast: [
    { date: "2024-03-20", temperature: 25, conditions: "Sunny" },
    { date: "2024-03-21", temperature: 23, conditions: "Partly Cloudy" },
    { date: "2024-03-22", temperature: 20, conditions: "Rain" }
  ]
};

const mockImage = {
  image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  name: "test.png"
};

// Test suite for weather API
Deno.test({
  name: "actionExecutor - Weather API Tests",
  fn: async () => {
    // Mock fetch globally
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const urlObj = new URL(url);
      const method = (options.method || 'GET').toUpperCase();
      
      // Route mock responses based on path and method
      if (urlObj.pathname === '/weather' && method === 'GET') {
        return new Response(JSON.stringify(mockWeather), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      } else if (urlObj.pathname === '/weather/forecast' && method === 'POST') {
        return new Response(JSON.stringify(mockForecast), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      
      throw new Error(`Unhandled mock request: ${url} (${method})`);
    };

    try {
      const functions = await actionExecutor({
        specs,
        specType: "openapi3_yaml",
        module: "native:request",
        config: {
          baseUrl: "https://api.example.com"
        }
      });

      // Test getWeather
      const weather = await functions.getWeather({ city: "New York" });
      assertObjectMatch(weather, mockWeather);

      // Test getForecast
      const forecast = await functions.getForecast({ 
        city: "New York",
        days: 3
      });
      assertObjectMatch(forecast, mockForecast);

    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

// Test suite for image handling
Deno.test({
  name: "actionExecutor - Image Handling Tests",
  fn: async () => {
    // Mock fetch globally
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlObj = new URL(url);
      
      if (urlObj.pathname === '/image') {
        return new Response(JSON.stringify(mockImage), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (urlObj.pathname === '/binary-image') {
        return new Response(mockImage.image, {
          headers: { "Content-Type": "image/png" },
        });
      }
      
      throw new Error(`Unhandled mock request: ${url}`);
    };

    try {
      const functions = await actionExecutor({
        specs,
        specType: "openapi3_yaml",
        module: "native:request",
        config: {
          baseUrl: "https://api.example.com"
        }
      });

      // Test JSON response with embedded image
      const imageResult = await functions.getImage();
      assertExists(imageResult.__media__, "Media should be extracted");
      assertEquals(imageResult.__media__.image, mockImage.image, "Image data should match");
      assertEquals(imageResult.name, mockImage.name, "Non-media properties should be preserved");

      // Test direct binary image response
      const binaryResult = await functions.getBinaryImage();
      assertExists(binaryResult.__media__, "Media should be extracted");
      assertEquals(
        binaryResult.__media__["/binary-image"],
        mockImage.image,
        "Binary image should be stored with path as key"
      );

    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

'use strict';
const swaggerJsdoc = require('swagger-jsdoc');
const cfg = require('../../config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Atlas05 Scraper API',
      version: '1.2.0',
      description: 'API for managing city/gym crawls, viewing scraped fitness venues, and system management for Atlas05.',
      contact: {
        name: 'Developer',
        url: 'https://atlas.onepassgym.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${cfg.server.port}`,
        description: 'Local development server'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid request' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' }
          }
        }
      }
    }
  },
  apis: ['./src/api/*.js'] // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

import { Express } from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { resolve } from "path";

export default function bootstrapSwagger(app: Express) {
  const { NODE_ENV } = process.env;
  if (NODE_ENV === "production") {
    return;
  }

  const swaggerSpec = swaggerJSDoc({
    swaggerDefinition: {
      info: {
        title: "BrotherEye",
        version: "0.0.1",
        description: "SNMP-based network monitoring solution",
      },
    },
    apis: [resolve(__dirname, "apis", "*")],
  });

  //app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
}

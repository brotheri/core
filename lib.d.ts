declare module "net-snmp";
declare module "oui";
declare module "@ganorberg/data-structures-javascript";
declare module "byte-size";
declare module "@relocke/unit-prefix-converter";
declare module "mongoose-findorcreate";
declare module "prettysize";

declare namespace Express {
  interface Request {
    user: any;
  }
}

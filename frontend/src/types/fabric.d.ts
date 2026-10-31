import 'fabric';

// The ticket editor tags objects with `name` (qr-placeholder, serial-placeholder, __bg__…)
// to find them again and to keep it in the saved design: declared for Fabric's types.
declare module 'fabric' {
  interface FabricObjectProps {
    name?: string;
  }
  interface SerializedObjectProps {
    name?: string;
  }
  interface FabricObject {
    name?: string;
  }
}

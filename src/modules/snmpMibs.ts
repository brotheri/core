export enum SNMPTable {
  ipRouteTable = "1.3.6.1.2.1.4.21",
  ipNetToMediaTable = "1.3.6.1.2.1.4.22",
  sysORTable = "1.3.6.1.2.1.1.9",
  ifTable = "1.3.6.1.2.1.2.2",
  ifXTable = "1.3.6.1.2.1.31.1.1",
  dot1dBasePortTable = "1.3.6.1.2.1.17.1.4",
  dot1qPortVlanTable = "1.3.6.1.2.1.17.7.1.4.5",
  ipAddrTable = "1.3.6.1.2.1.4.20",
  dot1dTpFdpTable = "1.3.6.1.2.1.17.4.3",
  dot1dStpPortTable = "1.3.6.1.2.1.17.2.15",
  prtGeneralTable = "1.3.6.1.2.1.43.5.1",
}

export enum SNMPSystemOID {
  // System MIBs
  sysDesc = "1.3.6.1.2.1.1.1.0",
  sysUptime = "1.3.6.1.2.1.1.3.0",
  sysName = "1.3.6.1.2.1.1.5.0",
  sysService = "1.3.6.1.2.1.1.7.0",
  printerMIBCompliance = "1.3.6.1.2.1.43.2.1.0",
  prtMIB = "1.3.6.1.2.1.43.5.1.1.1.1",
  dot1DBaseNumPorts = "1.3.6.1.2.1.17.1.2.0",
}

export enum SNMPMibs {
  ifPhysAddress = "1.3.6.1.2.1.2.2.1.6",
  dot1dBaseBridgeAddress = "1.3.6.1.2.1.17.1.1.0",
  ifInOctets = "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets = "1.3.6.1.2.1.2.2.1.16",
  ifHCInOctets = "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets = "1.3.6.1.2.1.31.1.1.1.10",
}

export enum SNMPNetToMediaEntry {
  ipNetToMediaIfIndex = "1",
  ipNetToMediaPhysAddress = "2",
  ipNetToMediaNetAddress = "3",
  ipNetToMediaType = "4",
}

export enum CiscoMib {
  vtpVlanTable = "1.3.6.1.4.1.9.9.46.1.3.1",
  vlanTrunkPortTable = "1.3.6.1.4.1.9.9.46.1.6.1",
}

export enum DeviceType {
  Host = "host",
  Switch_L2 = "l2-switch",
  Switch_L3_Bridge = "l3-switch-bridge",
  Switch_L4 = "l4-switch",
  SR_L7_Bridge = "sr-l7-bridge",
  Router = "router",
  Printer = "printer",
}

export enum HostResourceMib {
  hrSystemUptime = "1.3.6.1.2.1.25.1.1.0",
  hrStorageTable = "1.3.6.1.2.1.25.2.3",
  hrSWRunTable = "1.3.6.1.2.1.25.4.2",
  hrSWRunPerfTable = "1.3.6.1.2.1.25.5.1",
  hrSWInstalledTable = "1.3.6.1.2.1.25.6.3",
  hrMemorySize = "1.3.6.1.2.1.25.2.2.0",
}

{ pkgs }: {
  deps = [
    pkgs.lsof
    pkgs.nodejs_20
    pkgs.nodePackages.npm
  ];
}

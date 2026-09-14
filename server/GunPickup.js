let nextId = 1;

class GunPickup {
  constructor(type, point) {
    this.id = nextId++;
    this.type = type;
    this.x = point.x;
    this.y = point.y;
  }

  serialize() {
    return { id: this.id, type: this.type, x: this.x, y: this.y };
  }
}

module.exports = GunPickup;

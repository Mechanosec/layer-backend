import { ApiProperty } from '@nestjs/swagger';

export class ReservationsHealthDto {
  @ApiProperty({
    example: 0,
    description:
      'Variant/region pairs whose calculation is waiting on e-com reservations',
  })
  pendingRecalculations!: number;

  @ApiProperty({
    example: 0,
    description:
      'Pairs given up on after too many failed attempts — needs a human',
  })
  abandonedRecalculations!: number;

  @ApiProperty({
    example: 0,
    description:
      'Stored quantities resting on carried-over (unconfirmed) reservations',
  })
  staleQuantities!: number;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({
    type: ReservationsHealthDto,
    description:
      'Zeroes here mean every published quantity rests on confirmed reservations',
  })
  reservations!: ReservationsHealthDto;

  @ApiProperty({ example: 42 })
  uptimeSeconds!: number;
}

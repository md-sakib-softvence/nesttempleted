import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  buildPrismaQuery,
  calculatePaginationMeta,
  QueryOptions,
} from '../../utils/query.util';

@Injectable()
export class EmployeeService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async createEmployee(createEmployeeDto: CreateEmployeeDto) {
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingEmployee) {
      if (existingEmployee.isDeleted) {
        const token = await this.jwtService.signAsync(
          { sub: existingEmployee.employeeId, email: existingEmployee.email },
          { expiresIn: '15m' },
        );
        // Using the same recovery link logic as admin
        await this.mailService.sendRecoveryLink(existingEmployee.email, token);
        throw new ConflictException(
          'This account has been deactivated. A recovery link has been sent to your email.',
        );
      }
      throw new ConflictException('Employee with this email already exists');
    }

    const { password, ...rest } = createEmployeeDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.employee.create({
      data: {
        ...rest,
        password: hashedPassword,
      },
    });
  }

  async updateEmployee(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    // 1. Check if the employee exists
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { employeeId: id },
    });

    if (!existingEmployee) {
      throw new NotFoundException('Employee not found');
    }

    // 2. Check email uniqueness if email is being updated
    if (
      updateEmployeeDto.email &&
      updateEmployeeDto.email !== existingEmployee.email
    ) {
      const emailTaken = await this.prisma.employee.findUnique({
        where: { email: updateEmployeeDto.email },
      });
      if (emailTaken) {
        throw new ConflictException(
          'Email is already in use by another employee',
        );
      }
    }

    // 3. Prepare data safely without using 'any'
    const { password, ...restData } = updateEmployeeDto;
    let hashedPassword: string | undefined = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // 4. Perform the update
    return this.prisma.employee.update({
      where: { employeeId: id },
      data: {
        ...restData,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });
  }

  async getEmployeeById(id: string) {
    if (!id) {
      throw new NotFoundException('Employee ID is required');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeId: id },
    });

    if (!employee || employee.isDeleted) {
      throw new NotFoundException('Employee not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...employeeWithoutPassword } = employee;
    return employeeWithoutPassword;
  }

  async getAllEmployee(query: QueryOptions = {}) {
    const { where, skip, take, orderBy, page, limit } = buildPrismaQuery(
      query,
      ['name', 'email', 'showEmployeeId', 'phoneNumber'],
    );

    where.isDeleted = false;

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const meta = calculatePaginationMeta(total, page, limit);

    return { data, meta };
  }

  async deleteEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeId: id },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.employee.update({
      where: { employeeId: id },
      data: {
        isDeleted: true,
      },
    });
  }

  async recoverEmployee(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(token);
      const employee = await this.prisma.employee.findUnique({
        where: { employeeId: payload.sub },
      });

      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      if (!employee.isDeleted) {
        throw new ConflictException('Employee account is already active');
      }

      return await this.prisma.employee.update({
        where: { employeeId: employee.employeeId },
        data: { isDeleted: false },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired recovery link');
    }
  }
}

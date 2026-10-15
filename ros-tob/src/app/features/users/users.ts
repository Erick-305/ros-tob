import { NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { UsersService } from '../../services/users.service';

@Component({
  imports: [NgClass],
  selector: 'app-users',
  templateUrl: './users.html',
})
export class Users {
  protected readonly usersService = inject(UsersService);
  protected readonly users = this.usersService.users;

  protected loadUsers() { this.usersService.load(); }
  protected toggleUser(user: any) { this.usersService.toggle(user); }
}

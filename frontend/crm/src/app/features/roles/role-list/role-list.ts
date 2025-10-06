import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RoleService } from '../../../shared/services/role';


@Component({
  selector: 'app-role-list',
  templateUrl: './role-list.html',
  styleUrls: ['./role-list.scss'],
  standalone: false
})
export class RoleListComponent implements OnInit {
  roles: any[] = [];
  filteredRoles: any[] = [];
  searchTerm: string = '';

  constructor(
    private roleService: RoleService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.roleService.getRoles().subscribe({
      next: (data) => {
        this.roles = data;
        this.filteredRoles = [...this.roles];
      },
      error: (error) => {
        console.error('Error loading roles:', error);
      }
    });
  }

  filterRoles(): void {
    if (!this.searchTerm.trim()) {
      this.filteredRoles = [...this.roles];
      return;
    }

    const searchTermLower = this.searchTerm.toLowerCase();
    this.filteredRoles = this.roles.filter(role =>
      role.name.toLowerCase().includes(searchTermLower) ||
      role.description.toLowerCase().includes(searchTermLower)
    );
  }

  deleteRole(roleId: number): void {
    if (confirm('Are you sure you want to delete this role?')) {
      this.roleService.deleteRole(roleId).subscribe({
        next: () => {
          this.roles = this.roles.filter(role => role.id !== roleId);
          this.filterRoles();
        },
        error: (error) => {
          console.error('Error deleting role:', error);
        }
      });
    }
  }

  editRole(roleId: string): void {
    this.router.navigate(['/roles', roleId]);
  }

  createRole(): void {
    this.router.navigate(['/roles', 'new']);
  }
}
